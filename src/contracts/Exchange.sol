pragma solidity >=0.4.22 <0.9.0;

import "./Token.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

// TO DO:
// [X] Set the fee account
// [] Deposit Ether
// [] Withdraw Ether
// [] Deposit Tokens
// [] Withdraw Tokens
// [] Check balances
// [] Make order
// [] Cancel order
// [] Fill order
// [] Charge fees

contract Exchange {
    using SafeMath for uint;
    //vars
    address public feeAccount; // receive exchange fees
    uint256 public feePercent; // the fee percentage 
    mapping(address => mapping(address => uint256)) public tokens;

    //Events
    event Deposit(address token, address user, uint256 amount, uint256 balance);

    constructor(address _feeAccount, uint256 _feePercent) {
        feeAccount = _feeAccount;
        feePercent = _feePercent;
    }

    function depositToken(address _token, uint _amount) public {

        require(Token(_token).transferFrom(msg.sender, address(this), _amount));
        tokens[_token][msg.sender] = tokens[_token][msg.sender].add(_amount);
        emit Deposit(_token, msg.sender, _amount, tokens[_token][msg.sender]);
    }
}